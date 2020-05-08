include Xcodeproj::Project::Object
include Pod

# EXTENSIONS

class Installer 

  def products
    result = pod_targets.flat_map do |pod| pod.file_accessors 
    end.flat_map do |accessor| accessor.vendored_frameworks + accessor.vendored_libraries
    end.map do |s| s.basename end.map do |s|
      name = "#{s}"
      if name.include? "framework"
        "-framework \"#{name.sub(".framework", "")}\""
      else
        "-l\"#{name.sub("lib", "").sub(".a", "")}\""
      end
    end
  
    return result
  end

end 

class AbstractTarget

  ###### STEP 1 ######
  # In target's Build Phases, add platform filter to:
  # - Dependencies 
  # - Compile Sources
  def add_platform_filter_to_build_phases platform
    puts "\tTarget: #{name}"
    # Compiler Sources. Not defined for Agregates
    unless defined?(source_build_phase).nil?
      source_build_phase.files.to_a.map do |build_file|
        build_file.platform_filter = platform.name
      end
    end
  
    # Dependencies
    dependencies.each do |dependency|
      dependency.target.add_platform_filter_to_build_phases platform
      dependency.platform_filter = platform.name
    end
    puts "\t\tDone"
  end

  ###### STEP 2 ######
  # If any unsupported library, then flag as platform-dependant for every build configuration
  def flag_libraries libraries, platform
    puts "\tTarget: #{name}"
    build_configurations.filter do |config| not config.base_configuration_reference.nil? 
    end.each do |config|
      puts "\t\tConfig #{config.name}"
      xcconfig_path = config.base_configuration_reference.real_path
      xcconfig = File.read(xcconfig_path)

      libraries.each do |framework|
        if xcconfig.include? framework
          xcconfig.gsub!(framework, '')
          unless xcconfig.include? "OTHER_LDFLAGS[sdk=#{platform.sdk}]"
            xcconfig += "OTHER_LDFLAGS[sdk=#{platform.sdk}] = $(inherited) -ObjC "
          end
          xcconfig += framework + ' '
        end
      end

      File.open(xcconfig_path, "w") { |file| file << xcconfig }
      puts "\t\t\tDone"
    end
  end

  def dependency_link
    # We return both as we don't know if build as library or framework
    return ["-framework \"#{name}\"", "-l\"#{name}\""]
  end

  # Dependencies contained in Other Linker Flags
  def other_linker_flags_dependencies
    frameworks = Array.new
    libraries = Array.new
  
    config = build_configurations.filter do |config| not config.base_configuration_reference.nil? end.first
    xcconfig_path = config.base_configuration_reference.real_path
    xcconfig = File.read(xcconfig_path)
    xcconfig.gsub!(/\r\n?/, "\n")
  
    xcconfig.each_line do |line|
      if line.start_with? 'OTHER_LDFLAGS'
        frameworks = frameworks + line.split("-framework").map do |s|
              s.strip.delete("\n") end.filter do |s| 
              s.strip.start_with? '"' end
        libraries = libraries + line.split("-l").filter do |s| s.strip.start_with? '"' end.map do |s| s.strip.split(' ').first end
      end
    end
  
    return OtherLinkerFlagsDependencies.new libraries, frameworks 
  end
end

# HELPER CLASSES

class OtherLinkerFlagsDependencies
  attr_reader :libraries
  attr_reader :frameworks

  def initialize(libraries = [], frameworks = [])
    @libraries = libraries
    @frameworks = frameworks
  end

  def combine dependencies
    frameworks = (dependencies.frameworks + @frameworks).to_set.to_a
    libraries = (dependencies.libraries + @libraries).to_set.to_a
    return OtherLinkerFlagsDependencies.new libraries, frameworks
  end

  def links
    dependencies = frameworks.map do |value| "-framework #{value}" end + libraries.map do |value| "-l#{value}" end
    return dependencies.to_set.to_a
  end

  def substract dependencies
    libraries = @libraries.filter do |lib| not dependencies.libraries.include? lib end
    frameworks = @frameworks.filter do |framework| not dependencies.frameworks.include? framework end
    return OtherLinkerFlagsDependencies.new libraries.to_set.to_a, frameworks.to_set.to_a
  end

end

class OSPlatform
  attr_reader :sdk
  attr_reader :name

  def self.ios
    OSPlatform.new 'ios', 'iphone*'
  end

  def self.macos
    OSPlatform.new 'macos', 'macosx*'
  end

  def self.wtachos
    OSPlatform.new 'watchos', 'watchos*'
  end

  def self.tvos
    OSPlatform.new 'tvos', 'appletvos*'
  end

  private 
  def initialize(name, sdk)
    @name = name
    @sdk = sdk
  end

end

# SCRIPT

def configure_support_catalyst installer, pod_names

  puts "#### Unsupported Libraries ####\n\t #{pod_names}"

  # Variable definition
  targets = installer.pods_project.targets

  targets_to_filter = targets.filter do |target| pod_names.include?(target.name) end.flat_map do |target| [target] + target.dependencies.map do |d| d.target end end
  pods_targets = targets.filter do |target| target.name.start_with? "Pods-" end
  
  cross_platform_targets = targets.filter do |target| !targets_to_filter.include?(target) && !pods_targets.include?(target) end

  # Determine which dependencies should be removed
  dependencies_to_keep = cross_platform_targets.reduce(OtherLinkerFlagsDependencies.new) do |dependencies, target| 
    dependencies.combine target.other_linker_flags_dependencies end

  dependencies_to_remove = targets_to_filter.map do |target| 
    target.other_linker_flags_dependencies.substract dependencies_to_keep end.reduce(OtherLinkerFlagsDependencies.new) do |dependencies, new_dependencies| 
    dependencies.combine new_dependencies 
  end

  # CATALYST NOT SUPPORTED LIBRARIES
  unsupported_links = dependencies_to_remove.links + installer.products + targets_to_filter.flat_map do |target| target.dependency_link end

  # OTHER LINKER FLAGS -> to iphone*
  puts "#### Flagging unsupported libraries ####"
  targets.each do |target| target.flag_libraries unsupported_links, OSPlatform.ios end

  # COMPILER SOURCS AND DEPENDENCIES -> PLATFORM_FILTER 'ios'
  puts "#### Filtering dependencies and files ####"
  targets_to_filter.each do |target|  target.add_platform_filter_to_build_phases OSPlatform.ios end
end